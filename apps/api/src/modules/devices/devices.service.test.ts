import { randomUUID } from "node:crypto";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@medcal/db";
import { deviceCreateSchema, deviceUpdateSchema } from "@medcal/shared";
import { DevicesService } from "./devices.service";

const service = new DevicesService();
const realCompanyId = "PKM";
const createdDeviceIds: string[] = [];
const createdCustomerIds: string[] = [];
const createdCompanyIds: string[] = [];
const createdDeviceTypeIds: string[] = [];
const createdDeviceCategoryIds: string[] = [];
const createdCalibrationRequestIds: string[] = [];

function uniqueCode() {
  return `D${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

async function createCategory() {
  const category = await prisma.deviceCategory.create({
    data: { code: uniqueCode(), name: "Test Category" },
  });
  createdDeviceCategoryIds.push(category.id);
  return category;
}

async function createDeviceType(name = "Blood Pressure Monitor") {
  const category = await createCategory();
  const deviceType = await prisma.deviceType.create({
    data: {
      categoryId: category.id,
      code: uniqueCode(),
      name,
    },
  });
  createdDeviceTypeIds.push(deviceType.id);
  return deviceType;
}

async function createCustomer(companyId: string, name?: string) {
  const customer = await prisma.customer.create({
    data: {
      companyId,
      number: `CUS/TEST/${randomUUID().slice(0, 8)}`,
      name: name ?? `Test Customer ${randomUUID().slice(0, 6)}`,
    },
  });
  createdCustomerIds.push(customer.id);
  return customer;
}

afterAll(async () => {
  if (createdCalibrationRequestIds.length > 0) {
    await prisma.calibrationRequestItem.deleteMany({
      where: { requestId: { in: createdCalibrationRequestIds } },
    });
    await prisma.calibrationRequest.deleteMany({
      where: { id: { in: createdCalibrationRequestIds } },
    });
  }
  if (createdDeviceIds.length > 0) {
    await prisma.device.deleteMany({ where: { id: { in: createdDeviceIds } } });
  }
  if (createdDeviceTypeIds.length > 0) {
    await prisma.deviceType.deleteMany({ where: { id: { in: createdDeviceTypeIds } } });
  }
  if (createdDeviceCategoryIds.length > 0) {
    await prisma.deviceCategory.deleteMany({ where: { id: { in: createdDeviceCategoryIds } } });
  }
  if (createdCustomerIds.length > 0) {
    await prisma.customerContact.deleteMany({ where: { customerId: { in: createdCustomerIds } } });
    await prisma.customer.deleteMany({ where: { id: { in: createdCustomerIds } } });
  }
  for (const companyId of createdCompanyIds) {
    await prisma.company.delete({ where: { id: companyId } }).catch(() => undefined);
  }
});

describe("deviceCreateSchema / deviceUpdateSchema", () => {
  it("rejects a missing or empty deviceTypeId on create", () => {
    expect(deviceCreateSchema.safeParse({ customerId: "cust-1" }).success).toBe(false);
    expect(
      deviceCreateSchema.safeParse({ customerId: "cust-1", deviceTypeId: null }).success,
    ).toBe(false);
    expect(
      deviceCreateSchema.safeParse({ customerId: "cust-1", deviceTypeId: "" }).success,
    ).toBe(false);
  });

  it("rejects deviceTypeId = null on update", () => {
    expect(deviceUpdateSchema.safeParse({ deviceTypeId: null }).success).toBe(false);
    expect(deviceUpdateSchema.safeParse({ deviceTypeId: "" }).success).toBe(false);
  });
});

describe("DevicesService.create", () => {
  it("creates a device linked to a valid DeviceType and Customer", async () => {
    const deviceType = await createDeviceType();
    const customer = await createCustomer(realCompanyId);
    const serialNumber = `SN-${uniqueCode()}`;

    const device = await service.create(realCompanyId, {
      customerId: customer.id,
      deviceTypeId: deviceType.id,
      brand: "Omron",
      model: "HEM-7120",
      serialNumber,
      category: "Patient monitoring",
    });
    createdDeviceIds.push(device.id);

    expect(device.deviceTypeId).toBe(deviceType.id);
    expect(device.deviceType.name).toBe("Blood Pressure Monitor");
    expect(device.customerId).toBe(customer.id);
    expect(device.customer.name).toBe(customer.name);
    expect(device.brand).toBe("Omron");
    expect(device.model).toBe("HEM-7120");
    expect(device.serialNumber).toBe(serialNumber);
    expect(device.category).toBe("Patient monitoring");
    expect(device.status).toBe("ACTIVE");
    expect(device.companyId).toBe(realCompanyId);
  });

  it("rejects a non-existent deviceTypeId", async () => {
    const customer = await createCustomer(realCompanyId);

    await expect(
      service.create(realCompanyId, {
        customerId: customer.id,
        deviceTypeId: "missing-device-type-id",
        brand: "Orphan",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects a customer that does not belong to the company", async () => {
    const otherCompanyId = `C${randomUUID().slice(0, 2).toUpperCase()}`;
    await prisma.company.create({
      data: { id: otherCompanyId, name: "Other Co", status: "ACTIVE" },
    });
    createdCompanyIds.push(otherCompanyId);

    const deviceType = await createDeviceType();
    const foreignCustomer = await createCustomer(otherCompanyId);

    await expect(
      service.create(realCompanyId, {
        customerId: foreignCustomer.id,
        deviceTypeId: deviceType.id,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("DevicesService.findAll / findOne / update / remove", () => {
  it("lists, filters, searches, reads, updates, and deletes an unreferenced device", async () => {
    const deviceType = await createDeviceType("Ventilator");
    const otherType = await createDeviceType("Humidifier");
    const customer = await createCustomer(realCompanyId, "Acme Hospital");
    const otherCustomer = await createCustomer(realCompanyId, "Other Clinic");
    const serialNumber = `SN-${uniqueCode()}`;

    const created = await service.create(realCompanyId, {
      customerId: customer.id,
      deviceTypeId: deviceType.id,
      brand: "Mindray",
      model: "SV300",
      serialNumber,
    });
    createdDeviceIds.push(created.id);

    const listed = await service.findAll(realCompanyId, { search: serialNumber, page: 1, pageSize: 10 });
    expect(listed.data.some((row) => row.id === created.id)).toBe(true);

    const byTypeName = await service.findAll(realCompanyId, {
      search: "Ventilator",
      page: 1,
      pageSize: 10,
    });
    expect(byTypeName.data.some((row) => row.id === created.id)).toBe(true);

    const byCustomerName = await service.findAll(realCompanyId, {
      search: "Acme Hospital",
      page: 1,
      pageSize: 10,
    });
    expect(byCustomerName.data.some((row) => row.id === created.id)).toBe(true);

    const filteredType = await service.findAll(realCompanyId, {
      deviceTypeId: deviceType.id,
      page: 1,
      pageSize: 10,
    });
    expect(filteredType.data.some((row) => row.id === created.id)).toBe(true);

    const excludedType = await service.findAll(realCompanyId, {
      deviceTypeId: otherType.id,
      page: 1,
      pageSize: 10,
    });
    expect(excludedType.data.some((row) => row.id === created.id)).toBe(false);

    const filteredCustomer = await service.findAll(realCompanyId, {
      customerId: customer.id,
      page: 1,
      pageSize: 10,
    });
    expect(filteredCustomer.data.some((row) => row.id === created.id)).toBe(true);

    const excludedCustomer = await service.findAll(realCompanyId, {
      customerId: otherCustomer.id,
      page: 1,
      pageSize: 10,
    });
    expect(excludedCustomer.data.some((row) => row.id === created.id)).toBe(false);

    const filteredStatus = await service.findAll(realCompanyId, {
      status: "ACTIVE",
      search: serialNumber,
      page: 1,
      pageSize: 10,
    });
    expect(filteredStatus.data.some((row) => row.id === created.id)).toBe(true);

    const found = await service.findOne(realCompanyId, created.id);
    expect(found.serialNumber).toBe(serialNumber);

    const updated = await service.update(realCompanyId, created.id, {
      deviceTypeId: otherType.id,
      brand: "Philips",
      model: "V60",
      serialNumber: `${serialNumber}-U`,
      status: "INACTIVE",
    });
    expect(updated.deviceTypeId).toBe(otherType.id);
    expect(updated.brand).toBe("Philips");
    expect(updated.model).toBe("V60");
    expect(updated.serialNumber).toBe(`${serialNumber}-U`);
    expect(updated.status).toBe("INACTIVE");

    const removed = await service.remove(realCompanyId, created.id);
    expect(removed.id).toBe(created.id);
    createdDeviceIds.splice(createdDeviceIds.indexOf(created.id), 1);

    await expect(service.findOne(realCompanyId, created.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("rejects update of unknown id", async () => {
    await expect(service.findOne(realCompanyId, "missing-device-id")).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      service.update(realCompanyId, "missing-device-id", { brand: "Nope" }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects updating to a non-existent deviceTypeId", async () => {
    const deviceType = await createDeviceType();
    const customer = await createCustomer(realCompanyId);
    const created = await service.create(realCompanyId, {
      customerId: customer.id,
      deviceTypeId: deviceType.id,
    });
    createdDeviceIds.push(created.id);

    await expect(
      service.update(realCompanyId, created.id, { deviceTypeId: "missing-device-type-id" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects delete when the device is referenced by a calibration request", async () => {
    const deviceType = await createDeviceType();
    const customer = await createCustomer(realCompanyId);
    const created = await service.create(realCompanyId, {
      customerId: customer.id,
      deviceTypeId: deviceType.id,
    });
    createdDeviceIds.push(created.id);

    const request = await prisma.calibrationRequest.create({
      data: {
        companyId: realCompanyId,
        customerId: customer.id,
        number: `REQ/TEST/${randomUUID().slice(0, 8)}`,
        serviceMode: "ON_SITE",
        items: { create: { companyId: realCompanyId, deviceId: created.id } },
      },
    });
    createdCalibrationRequestIds.push(request.id);

    await expect(service.remove(realCompanyId, created.id)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe("DevicesService tenant isolation", () => {
  it("does not expose devices from another company", async () => {
    const otherCompanyId = `G${randomUUID().slice(0, 2).toUpperCase()}`;
    await prisma.company.create({
      data: { id: otherCompanyId, name: "Foreign Co", status: "ACTIVE" },
    });
    createdCompanyIds.push(otherCompanyId);

    const deviceType = await createDeviceType();
    const foreignCustomer = await createCustomer(otherCompanyId);
    const foreign = await service.create(otherCompanyId, {
      customerId: foreignCustomer.id,
      deviceTypeId: deviceType.id,
      serialNumber: `SN-FOREIGN-${uniqueCode()}`,
    });
    createdDeviceIds.push(foreign.id);

    await expect(service.findOne(realCompanyId, foreign.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    const listed = await service.findAll(realCompanyId, {
      search: foreign.serialNumber ?? undefined,
      page: 1,
      pageSize: 10,
    });
    expect(listed.data.some((row) => row.id === foreign.id)).toBe(false);
  });
});
