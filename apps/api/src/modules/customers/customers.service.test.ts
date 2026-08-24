import { randomUUID } from "node:crypto";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@medcal/db";
import { isValidDocumentNumber } from "@medcal/db";
import { CustomersService } from "./customers.service";

const service = new CustomersService();
const realCompanyId = "PKM";
const createdCustomerIds: string[] = [];
const createdCompanyIds: string[] = [];

async function cleanupCustomers(ids: string[]) {
  if (ids.length === 0) return;
  await prisma.customerContact.deleteMany({ where: { customerId: { in: ids } } });
  await prisma.customer.deleteMany({ where: { id: { in: ids } } });
}

async function cleanupSequences(companyId: string) {
  await prisma.documentNumberSequence.deleteMany({
    where: { companyId, documentType: "CUSTOMER" },
  });
}

afterAll(async () => {
  await cleanupCustomers(createdCustomerIds);
  await cleanupSequences(realCompanyId);
  for (const companyId of createdCompanyIds) {
    await cleanupSequences(companyId);
    await prisma.company.delete({ where: { id: companyId } }).catch(() => undefined);
  }
});

describe("CustomersService.createCustomer", () => {
  it("creates Customer, allocates CUS number, and creates primary contact when supplied", async () => {
    const email = `cust-${randomUUID().slice(0, 8)}@example.com`;

    const customer = await service.createCustomer(realCompanyId, {
      name: "Acme Hospital",
      contact: { name: "Dr. Smith", email, phone: "081234567890" },
    });
    createdCustomerIds.push(customer.id);

    expect(customer.name).toBe("Acme Hospital");
    expect(isValidDocumentNumber(customer.number)).toBe(true);
    expect(customer.number.startsWith("CUS/")).toBe(true);
    expect(customer.contacts).toHaveLength(1);
    expect(customer.contacts[0]?.isPrimary).toBe(true);
    expect(customer.contacts[0]?.email).toBe(email.toLowerCase());
  });

  it("creates Customer without contact when none is supplied", async () => {
    const customer = await service.createCustomer(realCompanyId, {
      name: `No Contact ${randomUUID().slice(0, 6)}`,
    });
    createdCustomerIds.push(customer.id);

    expect(customer.contacts).toHaveLength(0);
    expect(customer.number).toMatch(/^CUS\/\d{4}\/\d{2}\/\d{5}$/);
  });
});

describe("CustomersService duplicate prevention", () => {
  it("rejects duplicate email within the same company", async () => {
    const email = `dup-${randomUUID().slice(0, 8)}@example.com`;
    const first = await service.createCustomer(realCompanyId, {
      name: "First Customer",
      contact: { name: "PIC One", email },
    });
    createdCustomerIds.push(first.id);

    await expect(
      service.createCustomer(realCompanyId, {
        name: "Second Customer",
        contact: { name: "PIC Two", email: email.toUpperCase() },
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("allows duplicate email across different companies", async () => {
    const email = `cross-${randomUUID().slice(0, 8)}@example.com`;
    const otherCompanyId = `C${randomUUID().slice(0, 2).toUpperCase()}`;
    await prisma.company.create({ data: { id: otherCompanyId, name: "Other Co", status: "ACTIVE" } });
    createdCompanyIds.push(otherCompanyId);

    const first = await service.createCustomer(realCompanyId, {
      name: "Company A Customer",
      contact: { name: "PIC A", email },
    });
    createdCustomerIds.push(first.id);

    await cleanupSequences(otherCompanyId);
    const second = await service.createCustomer(otherCompanyId, {
      name: "Company B Customer",
      contact: { name: "PIC B", email },
    });
    createdCustomerIds.push(second.id);

    expect(second.contacts[0]?.email).toBe(email.toLowerCase());
  });

  it("rejects duplicate taxId within the same company", async () => {
    const taxId = `TAX-${randomUUID().slice(0, 8)}`;
    const first = await service.createCustomer(realCompanyId, {
      name: "Tax Customer One",
      taxId,
    });
    createdCustomerIds.push(first.id);

    await expect(
      service.createCustomer(realCompanyId, {
        name: "Tax Customer Two",
        taxId,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("allows duplicate taxId across different companies", async () => {
    const taxId = `TAX-X-${randomUUID().slice(0, 8)}`;
    const otherCompanyId = `D${randomUUID().slice(0, 2).toUpperCase()}`;
    await prisma.company.create({ data: { id: otherCompanyId, name: "Other Co 2", status: "ACTIVE" } });
    createdCompanyIds.push(otherCompanyId);

    const first = await service.createCustomer(realCompanyId, { name: "Tax A", taxId });
    createdCustomerIds.push(first.id);

    await cleanupSequences(otherCompanyId);
    const second = await service.createCustomer(otherCompanyId, { name: "Tax B", taxId });
    createdCustomerIds.push(second.id);

    expect(second.taxId).toBe(taxId);
  });
});

describe("CustomersService tenant isolation", () => {
  it("throws NotFoundException when accessing a Customer from another company", async () => {
    const otherCompanyId = `E${randomUUID().slice(0, 2).toUpperCase()}`;
    await prisma.company.create({ data: { id: otherCompanyId, name: "Foreign Co", status: "ACTIVE" } });
    createdCompanyIds.push(otherCompanyId);

    await cleanupSequences(otherCompanyId);
    const foreign = await service.createCustomer(otherCompanyId, { name: "Foreign Customer" });
    createdCustomerIds.push(foreign.id);

    await expect(service.findOne(realCompanyId, foreign.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("scopes list results to the given companyId", async () => {
    const otherCompanyId = `F${randomUUID().slice(0, 2).toUpperCase()}`;
    await prisma.company.create({ data: { id: otherCompanyId, name: "List Co", status: "ACTIVE" } });
    createdCompanyIds.push(otherCompanyId);

    await cleanupSequences(otherCompanyId);
    const foreign = await service.createCustomer(otherCompanyId, {
      name: `Foreign List ${randomUUID().slice(0, 6)}`,
    });
    createdCustomerIds.push(foreign.id);

    const result = await service.findAll(realCompanyId, { search: foreign.name });
    expect(result.data.some((c) => c.id === foreign.id)).toBe(false);
  });
});

describe("CustomersService.update", () => {
  it("updates customer fields and primary contact", async () => {
    const created = await service.createCustomer(realCompanyId, {
      name: "Before Update",
      contact: { name: "Old PIC", email: `old-${randomUUID().slice(0, 8)}@example.com` },
    });
    createdCustomerIds.push(created.id);

    const newEmail = `new-${randomUUID().slice(0, 8)}@example.com`;
    const updated = await service.update(realCompanyId, created.id, {
      name: "After Update",
      legalName: "PT After",
      contact: {
        name: "New PIC",
        email: newEmail,
        phone: "081111111111",
        title: "Director",
      },
    });

    expect(updated.name).toBe("After Update");
    expect(updated.legalName).toBe("PT After");
    expect(updated.contacts).toHaveLength(1);
    expect(updated.contacts[0]?.name).toBe("New PIC");
    expect(updated.contacts[0]?.email).toBe(newEmail.toLowerCase());
    expect(updated.contacts[0]?.phone).toBe("081111111111");
    expect(updated.contacts[0]?.title).toBe("Director");
  });

  it("creates primary contact on update when none exists", async () => {
    const created = await service.createCustomer(realCompanyId, {
      name: `No Contact Update ${randomUUID().slice(0, 6)}`,
    });
    createdCustomerIds.push(created.id);

    const updated = await service.update(realCompanyId, created.id, {
      contact: { name: "Added PIC", phone: "082222222222" },
    });

    expect(updated.contacts).toHaveLength(1);
    expect(updated.contacts[0]?.isPrimary).toBe(true);
    expect(updated.contacts[0]?.name).toBe("Added PIC");
  });

  it("rejects duplicate email on contact update within the same company", async () => {
    const sharedEmail = `shared-${randomUUID().slice(0, 8)}@example.com`;
    const first = await service.createCustomer(realCompanyId, {
      name: "Customer A",
      contact: { name: "PIC A", email: sharedEmail },
    });
    createdCustomerIds.push(first.id);

    const second = await service.createCustomer(realCompanyId, {
      name: "Customer B",
      contact: { name: "PIC B", email: `other-${randomUUID().slice(0, 8)}@example.com` },
    });
    createdCustomerIds.push(second.id);

    await expect(
      service.update(realCompanyId, second.id, {
        contact: { name: "PIC B", email: sharedEmail },
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe("CustomersService numbering", () => {
  it("uses DocumentNumberService with company-scoped sequence", async () => {
    const first = await service.createCustomer(realCompanyId, {
      name: `Seq One ${randomUUID().slice(0, 4)}`,
    });
    createdCustomerIds.push(first.id);

    const second = await service.createCustomer(realCompanyId, {
      name: `Seq Two ${randomUUID().slice(0, 4)}`,
    });
    createdCustomerIds.push(second.id);

    const firstSeq = Number(first.number.split("/").pop());
    const secondSeq = Number(second.number.split("/").pop());
    expect(secondSeq).toBeGreaterThan(firstSeq);
    expect(first.number.slice(0, 15)).toBe(second.number.slice(0, 15));
  });
});
