import { randomUUID } from "node:crypto";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@medcal/db";
import type { NotificationDispatchService } from "../push-tokens/notification-dispatch.service";
import { CustomersService } from "../customers/customers.service";
import { LeadsService } from "./leads.service";

const notificationDispatch = {
  sendToUsers: async () => ({ tokens: 0, sent: 0, failed: 0, deactivated: 0 }),
} as NotificationDispatchService;

const customersService = new CustomersService();
const service = new LeadsService(notificationDispatch, customersService);

const realCompanyId = "PKM";
const createdLeadIds: string[] = [];
const createdCustomerIds: string[] = [];

async function cleanupCustomers(ids: string[]) {
  if (ids.length === 0) return;
  await prisma.customerContact.deleteMany({ where: { customerId: { in: ids } } });
  await prisma.customer.deleteMany({ where: { id: { in: ids } } });
}

async function makeLead(overrides: Record<string, unknown> = {}) {
  const lead = await prisma.lead.create({
    data: {
      companyId: realCompanyId,
      name: "Lead Contact",
      email: `lead-${randomUUID().slice(0, 8)}@example.com`,
      phone: "081234567890",
      organizationName: "Lead Org Name",
      ...overrides,
    },
  });
  createdLeadIds.push(lead.id);
  return lead;
}

afterAll(async () => {
  await prisma.lead.deleteMany({ where: { id: { in: createdLeadIds } } });
  await cleanupCustomers(createdCustomerIds);
  await prisma.documentNumberSequence.deleteMany({
    where: { companyId: realCompanyId, documentType: "CUSTOMER" },
  });
});

describe("LeadsService.convertToCustomer", () => {
  it("creates Customer, CustomerContact, sets customerId and CONVERTED status", async () => {
    const lead = await makeLead();

    const result = await service.convertToCustomer(realCompanyId, lead.id);
    createdCustomerIds.push(result.customer.id);

    expect(result.customer.name).toBe("Lead Org Name");
    expect(result.customer.number).toMatch(/^CUS\/\d{4}\/\d{2}\/\d{5}$/);
    expect(result.customer.contacts).toHaveLength(1);
    expect(result.customer.contacts[0]?.name).toBe("Lead Contact");
    expect(result.customer.contacts[0]?.email).toBe(lead.email.toLowerCase());
    expect(result.customer.contacts[0]?.phone).toBe("081234567890");

    expect(result.lead.customerId).toBe(result.customer.id);
    expect(result.lead.status).toBe("CONVERTED");

    const reloaded = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(reloaded.customerId).toBe(result.customer.id);
    expect(reloaded.status).toBe("CONVERTED");
  });

  it("uses Lead.name as Customer.name when organizationName is absent", async () => {
    const lead = await makeLead({ organizationName: null, name: "Person Only" });

    const result = await service.convertToCustomer(realCompanyId, lead.id);
    createdCustomerIds.push(result.customer.id);

    expect(result.customer.name).toBe("Person Only");
  });

  it("applies optional overrides for legalName, taxId, and address", async () => {
    const lead = await makeLead();
    const taxId = `LEAD-TAX-${randomUUID().slice(0, 6)}`;

    const result = await service.convertToCustomer(realCompanyId, lead.id, {
      legalName: "PT Lead Legal",
      taxId,
      address: "Jl. Test 123",
    });
    createdCustomerIds.push(result.customer.id);

    expect(result.customer.legalName).toBe("PT Lead Legal");
    expect(result.customer.taxId).toBe(taxId);
    expect(result.customer.address).toBe("Jl. Test 123");
  });

  it("rejects conversion when Lead is already linked to a Customer", async () => {
    const lead = await makeLead();
    const first = await service.convertToCustomer(realCompanyId, lead.id);
    createdCustomerIds.push(first.customer.id);

    await expect(service.convertToCustomer(realCompanyId, lead.id)).rejects.toBeInstanceOf(
      ConflictException,
    );

    const customers = await prisma.customer.count({
      where: { leads: { some: { id: lead.id } } },
    });
    expect(customers).toBe(1);
  });

  it("does not update Lead when duplicate email causes conversion to fail", async () => {
    const email = `convert-dup-${randomUUID().slice(0, 8)}@example.com`;
    const existing = await customersService.createCustomer(realCompanyId, {
      name: "Existing Customer",
      contact: { name: "Existing PIC", email },
    });
    createdCustomerIds.push(existing.id);

    const lead = await makeLead({ email, status: "QUALIFIED" });

    await expect(service.convertToCustomer(realCompanyId, lead.id)).rejects.toBeInstanceOf(
      ConflictException,
    );

    const reloaded = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(reloaded.customerId).toBeNull();
    expect(reloaded.status).toBe("QUALIFIED");
  });

  it("throws NotFoundException for a Lead in a different company", async () => {
    const otherCompanyId = `G${randomUUID().slice(0, 2).toUpperCase()}`;
    await prisma.company.create({ data: { id: otherCompanyId, name: "Other Lead Co", status: "ACTIVE" } });
    const otherLead = await prisma.lead.create({
      data: {
        companyId: otherCompanyId,
        name: "Foreign Lead",
        email: "foreign-lead@example.com",
      },
    });

    await expect(service.convertToCustomer(realCompanyId, otherLead.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    await prisma.lead.delete({ where: { id: otherLead.id } });
    await prisma.company.delete({ where: { id: otherCompanyId } });
  });
});
