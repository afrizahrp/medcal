import { randomUUID } from "node:crypto";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@medcal/db";
import { TaxesService } from "./taxes.service";

const service = new TaxesService();
const realCompanyId = "PKM";
const createdTaxIds: string[] = [];
const createdCompanyIds: string[] = [];

function uniqueCode() {
  return `T${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

afterAll(async () => {
  if (createdTaxIds.length > 0) {
    await prisma.tax.deleteMany({ where: { id: { in: createdTaxIds } } });
  }
  for (const companyId of createdCompanyIds) {
    await prisma.company.delete({ where: { id: companyId } }).catch(() => undefined);
  }
});

describe("TaxesService.create", () => {
  it("creates a tax with required fields", async () => {
    const taxCode = uniqueCode();
    const tax = await service.create(realCompanyId, {
      taxCode,
      description: "PPN 11%",
      taxRate: 0.11,
      isExclude: true,
    });
    createdTaxIds.push(tax.id);

    expect(tax.companyId).toBe(realCompanyId);
    expect(tax.taxCode).toBe(taxCode);
    expect(tax.description).toBe("PPN 11%");
    expect(Number(tax.taxRate)).toBe(0.11);
    expect(tax.isExclude).toBe(true);
    expect(tax.isActive).toBe(true);
  });

  it("defaults isExclude to false", async () => {
    const tax = await service.create(realCompanyId, {
      taxCode: uniqueCode(),
      description: "Non PPN",
      taxRate: 0,
    });
    createdTaxIds.push(tax.id);

    expect(tax.isExclude).toBe(false);
    expect(Number(tax.taxRate)).toBe(0);
  });

  it("rejects duplicate taxCode within the same company", async () => {
    const taxCode = uniqueCode();
    const first = await service.create(realCompanyId, {
      taxCode,
      description: "First",
      taxRate: 0.11,
    });
    createdTaxIds.push(first.id);

    await expect(
      service.create(realCompanyId, {
        taxCode,
        description: "Second",
        taxRate: 0.12,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("allows the same taxCode across different companies", async () => {
    const taxCode = uniqueCode();
    const otherCompanyId = `T${randomUUID().slice(0, 2).toUpperCase()}`;
    await prisma.company.create({
      data: { id: otherCompanyId, name: "Other Tax Co", status: "ACTIVE" },
    });
    createdCompanyIds.push(otherCompanyId);

    const first = await service.create(realCompanyId, {
      taxCode,
      description: "PKM tax",
      taxRate: 0.11,
    });
    createdTaxIds.push(first.id);

    const second = await service.create(otherCompanyId, {
      taxCode,
      description: "Other tax",
      taxRate: 0.11,
    });
    createdTaxIds.push(second.id);

    expect(second.companyId).toBe(otherCompanyId);
    expect(second.taxCode).toBe(taxCode);
  });
});

describe("TaxesService.findAll / findOne / update", () => {
  it("lists, reads, and updates a tax", async () => {
    const taxCode = uniqueCode();
    const created = await service.create(realCompanyId, {
      taxCode,
      description: "PPN 11%",
      taxRate: 0.11,
      isExclude: false,
    });
    createdTaxIds.push(created.id);

    const listed = await service.findAll(realCompanyId, { search: taxCode, page: 1, pageSize: 10 });
    expect(listed.data.some((row) => row.id === created.id)).toBe(true);
    expect(listed.page).toBe(1);

    const found = await service.findOne(realCompanyId, created.id);
    expect(found.taxCode).toBe(taxCode);

    const updated = await service.update(realCompanyId, created.id, {
      description: "PPN 11% include",
      isExclude: true,
      isActive: false,
    });
    expect(updated.description).toBe("PPN 11% include");
    expect(updated.isExclude).toBe(true);
    expect(updated.isActive).toBe(false);
  });

  it("rejects access to a tax from another company", async () => {
    const otherCompanyId = `U${randomUUID().slice(0, 2).toUpperCase()}`;
    await prisma.company.create({
      data: { id: otherCompanyId, name: "Foreign Tax Co", status: "ACTIVE" },
    });
    createdCompanyIds.push(otherCompanyId);

    const foreign = await service.create(otherCompanyId, {
      taxCode: uniqueCode(),
      description: "Foreign",
      taxRate: 0.11,
    });
    createdTaxIds.push(foreign.id);

    await expect(service.findOne(realCompanyId, foreign.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      service.update(realCompanyId, foreign.id, { description: "Nope" }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("scopes list results to the given companyId", async () => {
    const otherCompanyId = `V${randomUUID().slice(0, 2).toUpperCase()}`;
    await prisma.company.create({
      data: { id: otherCompanyId, name: "List Tax Co", status: "ACTIVE" },
    });
    createdCompanyIds.push(otherCompanyId);

    const foreign = await service.create(otherCompanyId, {
      taxCode: uniqueCode(),
      description: `Foreign List ${randomUUID().slice(0, 6)}`,
      taxRate: 0,
    });
    createdTaxIds.push(foreign.id);

    const result = await service.findAll(realCompanyId, { search: foreign.description });
    expect(result.data.some((row) => row.id === foreign.id)).toBe(false);
  });

  it("rejects updating taxCode onto an existing one in the same company", async () => {
    const first = await service.create(realCompanyId, {
      taxCode: uniqueCode(),
      description: "First",
      taxRate: 0,
    });
    const second = await service.create(realCompanyId, {
      taxCode: uniqueCode(),
      description: "Second",
      taxRate: 0.11,
    });
    createdTaxIds.push(first.id, second.id);

    await expect(
      service.update(realCompanyId, second.id, { taxCode: first.taxCode }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("rejects unknown id", async () => {
    await expect(service.findOne(realCompanyId, "missing-tax-id")).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      service.update(realCompanyId, "missing-tax-id", { description: "Nope" }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("listActive returns only active taxes for the company", async () => {
    const active = await service.create(realCompanyId, {
      taxCode: uniqueCode(),
      description: "Active option",
      taxRate: 0.11,
    });
    const inactive = await service.create(realCompanyId, {
      taxCode: uniqueCode(),
      description: "Inactive option",
      taxRate: 0,
    });
    createdTaxIds.push(active.id, inactive.id);
    await service.update(realCompanyId, inactive.id, { isActive: false });

    const options = await service.listActive(realCompanyId);
    expect(options.some((row) => row.id === active.id)).toBe(true);
    expect(options.some((row) => row.id === inactive.id)).toBe(false);
  });
});
